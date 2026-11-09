package eventlog

import "testing"

func TestTeamInternalEventTypesRegistered(t *testing.T) {
	types := []string{
		TypeTeamCreated, TypeTeamArchived, TypeTeamTemplateApplied, TypeTeamMemberAdded,
		TypeTeamMemberStatus, TypeTeamOwnerChanged, TypeTeamMessageQueued,
		TypeTeamMessageDelivered, TypeTeamMessageFailed, TypeTeamTriggerFired,
		TypeTeamTriggerFailed, TypeTeamDeliverableReady, TypeViewUpdated, TypeViewRender,
	}
	for _, typ := range types {
		if !IsPersistedType(typ) {
			t.Fatalf("事件类型未注册: %s", typ)
		}
	}
}
